import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { unauthorized, forbidden } from './error-handler';

export type Role = 'ADMIN' | 'OPS_MANAGER' | 'TECHNICIAN' | 'CUSTOMER';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    full_name: string;
  };
}

/**
 * Verify the Supabase JWT from the Authorization header and attach the app-level
 * user profile (from our `users` table) to `req.user`.
 */
export const authenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(unauthorized('Missing authorization header'));
    }
    const token = authHeader.slice('Bearer '.length).trim();

    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !authUser) return next(unauthorized('Invalid or expired token'));

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, full_name, role')
      .eq('auth_id', authUser.id)
      .single();

    if (profileError || !profile) return next(unauthorized('User profile not found'));

    req.user = profile as AuthRequest['user'];
    return next();
  } catch {
    return next(unauthorized('Authentication failed'));
  }
};

/** Role guard. Use after `authenticate`. */
export const authorize =
  (...roles: Role[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
