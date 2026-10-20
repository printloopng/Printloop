import { Request, Response, NextFunction } from 'express';
import { User } from '@/database/entities/user.entity';
import { CustomerAuthService } from '@/modules/customer/services/auth.service';

const authService = new CustomerAuthService();

function authedUser(req: Request): User {
  return (req as any).user as User;
}

export class CustomerAuthController {
  register = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await authService.register(req, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Customer register error:', error);
      res.status(500).json({ success: false, message: 'Registration failed' });
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await authService.verifyEmail(req, req.body || {});
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await authService.resendVerification(req, req.body || {});
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await authService.login(req, req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Customer login error:', error);
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = authService.getMe(authedUser(req));
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await authService.updateProfile(authedUser(req), req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Customer profile update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
  };

  changePassword = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await authService.changePassword(authedUser(req), req.body);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error('Customer password update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update password' });
    }
  };

  exportData = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await authService.exportData(req, authedUser(req));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.attachmentFilename}"`,
      );
      res.send(JSON.stringify(result.body, null, 2));
    } catch (err: any) {
      console.error('Customer export error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Export failed' });
    }
  };

  closeAccount = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const confirmEmail = String(req.body?.confirmEmail || '');
      const result = await authService.closeAccount(req, authedUser(req), confirmEmail);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error('Customer close error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Close failed' });
    }
  };
}

export const customerAuthController = new CustomerAuthController();
