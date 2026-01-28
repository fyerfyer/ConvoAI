import z from 'zod';
import { loginSchema, registerSchema } from '../dtos/auth.dto';
import { ApiResponse } from '../interfaces/api.interface';
import { AuthResponse } from '../interfaces/response.interface';

export const AuthContracts = {
  login: {
    path: 'auth/login',
    method: 'POST',
    body: loginSchema,
  },

  register: {
    path: 'auth/register',
    method: 'POST',
    body: registerSchema,
  },
} as const;

export type IAuthContract = {
  login: {
    req: z.infer<typeof AuthContracts.login.body>;
    res: ApiResponse<AuthResponse>;
  };

  register: {
    req: z.infer<typeof AuthContracts.register.body>;
    res: ApiResponse<AuthResponse>;
  };
};
