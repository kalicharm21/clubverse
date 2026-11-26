import {Router} from 'express';
import {loginDemoSchema, registerDemoSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth} from '../../middleware/authorization.ts';
import {authRateLimiter} from '../../middleware/rateLimiter.ts';
import {validateBody} from '../../middleware/validation.ts';
import {AuthController} from './auth.controller.ts';
import {AuthService} from './auth.service.ts';

export function createAuthRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new AuthService(adapter);
  const controller = new AuthController(service);

  router.get('/auth/config', controller.getConfig);
  router.get('/auth/demo-personas', controller.getPersonas);
  router.post('/auth/demo-login', authRateLimiter, validateBody(loginDemoSchema), controller.loginDemo);
  router.post('/auth/demo-register', authRateLimiter, validateBody(registerDemoSchema), controller.registerDemo);
  router.get('/auth/me', requireAuth, controller.getMe);
  router.post('/auth/logout', controller.logout);

  return router;
}
