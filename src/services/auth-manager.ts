import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  isGuest: boolean;
}

export type AuthStateChangeCallback = (state: AuthState) => void;

export class AuthManager {
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private listeners: Set<AuthStateChangeCallback> = new Set();
  private lastNotifiedKey: string | null = null;

  constructor() {
    // Listen for auth state transitions as single source of truth
    supabase.auth.onAuthStateChange((_event, session) => {
      this.currentSession = session;
      this.currentUser = session?.user ?? null;
      this.notify();
    });
  }

  public async init(): Promise<AuthState> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error fetching initial session:', error.message);
    }
    this.currentSession = data.session;
    this.currentUser = data.session?.user ?? null;
    return this.getState();
  }

  public getState(): AuthState {
    const isGuest = Boolean(
      this.currentUser?.is_anonymous ||
      (this.currentUser && !this.currentUser.email)
    );
    return {
      user: this.currentUser,
      session: this.currentSession,
      isGuest,
    };
  }

  public subscribe(callback: AuthStateChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => {
      this.listeners.delete(callback);
    };
  }

  public async signUp(
    email: string,
    password: string
  ): Promise<{ user: User | null; session: Session | null; error: string | null; needsEmailConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      return { user: null, session: null, error: error.message, needsEmailConfirmation: false };
    }
    this.currentUser = data.user;
    this.currentSession = data.session;
    const needsEmailConfirmation = !data.session && Boolean(data.user);
    return {
      user: data.user,
      session: data.session,
      error: null,
      needsEmailConfirmation,
    };
  }

  public async signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { user: null, error: error.message };
    }
    this.currentUser = data.user;
    this.currentSession = data.session;
    return { user: data.user, error: null };
  }

  public async signInAsGuest(): Promise<{ user: User | null; error: string | null }> {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      return { user: null, error: error.message };
    }
    this.currentUser = data.user;
    this.currentSession = data.session;
    return { user: data.user, error: null };
  }

  public async linkGuestAccount(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
    const { data, error } = await supabase.auth.updateUser({
      email,
      password,
    });
    if (error) {
      return { user: null, error: error.message };
    }
    this.currentUser = data.user;
    return { user: data.user, error: null };
  }

  public async signOut(): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    this.currentUser = null;
    this.currentSession = null;
    this.notify();
    return { error: null };
  }

  private notify(): void {
    const state = this.getState();
    const currentKey = `${state.user?.id ?? 'none'}:${state.isGuest}:${state.user?.email ?? ''}`;
    if (this.lastNotifiedKey === currentKey) {
      return;
    }
    this.lastNotifiedKey = currentKey;

    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

export const authManager = new AuthManager();
