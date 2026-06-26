import { z } from "zod";

export const CustomerSignUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(3, "Username must be at least 3 chars"),
  email: z.string().email(),
  phone: z.string().optional().default(""),
  password: z.string().min(8, "Password must be at least 8 chars"),
});

export const BusinessSignUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(3, "Username must be at least 3 chars"),
  email: z.string().email(),
  phone: z.string().min(6),
  password: z.string().min(8, "Password must be at least 8 chars"),
});

export const SignUpSchema = BusinessSignUpSchema;

export const LoginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(8),
});

export const CustomerUpdateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().min(3, "Username must be at least 3 chars"),
  email: z.string().email(),
  phone: z.string().optional().default(""),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 chars"),
});
