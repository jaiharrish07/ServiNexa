import { Router, Request, Response } from 'express';
import { supabase, createAuthClient } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler, badRequest, unauthorized } from '../middleware/error-handler';
import { authLimiter } from '../middleware/rate-limit';
import { wrap, created } from '../utils/api-response';
import { signupSchema, loginSchema } from '../schemas/auth';

const router = Router();

// POST /api/auth/signup
router.post(
  '/signup',
  authLimiter,
  validate({ body: signupSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, full_name, phone } = req.body;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData?.user) throw badRequest(authError?.message ?? 'Could not create auth user');

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({ auth_id: authData.user.id, email, full_name, role: 'CUSTOMER', phone })
      .select()
      .single();
    if (profileError) {
      // Do not leave an auth identity that can never resolve to an app profile.
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw badRequest(profileError.message);
    }

    created(res, wrap('user', profile));
  }),
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
    if (error || !data?.session || !data?.user) throw unauthorized(error?.message ?? 'Invalid credentials');

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, full_name, role, phone, avatar_url, is_active')
      .eq('auth_id', data.user.id)
      .single();
    if (!profile || profile.is_active === false) throw unauthorized('User profile is inactive or unavailable');

    res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: profile,
    });
  }),
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(wrap('user', req.user));
  }),
);

export default router;
