import { z } from "zod";
export const SignUpSchema = z.object({
    name: z.string().min(1, "Name is required"),
    username: z.string().min(3, "Username must be at least 3 chars"),
    email: z.string().email(),
    phone: z.string().min(6),
    password: z.string().min(8, "Password must be at least 8 chars"),
    plan: z.enum(["Starter", "Professional", "Custom"]),
});
export const LoginSchema = z.object({
    emailOrUsername: z.string().min(1),
    password: z.string().min(8),
});
