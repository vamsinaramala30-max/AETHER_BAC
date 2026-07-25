# Passport.js Google OAuth Migration - Implementation Steps

## Phase 1: Install Backend Dependencies
- [x] Install `passport`, `passport-google-oauth20`, `express-session`
- [x] Install `@types/passport`, `@types/passport-google-oauth20`, `@types/express-session`

## Phase 2: Create New Backend Auth Files
- [ ] Create `src/auth/passport.ts` - Passport init, serialize/deserialize
- [ ] Create `src/auth/google.strategy.ts` - Google OAuth strategy

## Phase 3: Modify Backend Config Files
- [ ] Update `src/config/env.ts` - Add FRONTEND_URL env var
- [ ] Update `src/config/cors.ts` - Ensure frontend URL allowed

## Phase 4: Update Backend Auth Module
- [ ] Update `src/auth/oauth.ts` - Add Passport-based OAuth service methods
- [ ] Update `src/modules/auth/auth.types.ts` - Add OAuth response types
- [ ] Update `src/modules/auth/auth.repository.ts` - Add OAuth account lookup methods
- [ ] Update `src/modules/auth/auth.service.ts` - Add findOrCreateOAuthUser
- [ ] Update `src/modules/auth/auth.controller.ts` - Add Google OAuth handlers
- [ ] Update `src/modules/auth/auth.routes.ts` - Add Google OAuth routes

## Phase 5: Update Backend Main Server
- [ ] Update `server.ts` - Initialize passport, session, cors, helmet, mount routes

## Phase 6: Update Frontend Auth Layer
- [ ] Rewrite `frontend/src/auth/authservice.ts` - Remove Supabase Auth, use backend API
- [ ] Update `frontend/src/auth/loginpage.tsx` - Fix Google sign-in to redirect to backend
- [ ] Update `frontend/src/app/providers/authprovider.tsx` - Remove Supabase subscription
- [ ] Update `frontend/src/services/authService.ts` - Add handleOAuthRedirect method

## Phase 7: Add Frontend OAuth Callback Route
- [ ] Create or update route for `/auth/success` to capture JWT token

## Phase 8: Verification
- [ ] Backend builds successfully
- [ ] Frontend builds successfully
- [ ] No TypeScript errors
- [ ] Google login flow works end-to-end
- [ ] Existing email/password login still works
- [ ] JWT authentication works for protected routes
- [ ] Logout works
- [ ] Page refresh keeps user authenticated
- [ ] No CORS issues

