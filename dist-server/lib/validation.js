import { z } from "zod";
// Customer accounts (users collection): lean profile, no business fields.
// Phone is optional for customers; when omitted it is stored as "" so the
// required `User.phone` field stays satisfied (no schema change needed).
export const CustomerSignUpSchema = z.object({
    name: z.string().min(1, "Name is required"),
    username: z.string().min(3, "Username must be at least 3 chars"),
    email: z.string().email(),
    phone: z.string().optional().default(""),
    password: z.string().min(8, "Password must be at least 8 chars"),
});
// Business accounts (businesses collection). No plan — billing is manual.
export const BusinessSignUpSchema = z.object({
    name: z.string().min(1, "Name is required"),
    username: z.string().min(3, "Username must be at least 3 chars"),
    email: z.string().email(),
    phone: z.string().min(6),
    password: z.string().min(8, "Password must be at least 8 chars"),
});
// Kept for backwards compatibility with any existing imports.
export const SignUpSchema = BusinessSignUpSchema;
export const LoginSchema = z.object({
    emailOrUsername: z.string().min(1),
    password: z.string().min(8),
});
// Customer profile edit (all fields). Phone stays optional (stored as "").
export const CustomerUpdateSchema = z.object({
    name: z.string().min(1, "Name is required"),
    username: z.string().min(3, "Username must be at least 3 chars"),
    email: z.string().email(),
    phone: z.string().optional().default(""),
});
// Customer password change: requires the current password.
export const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 chars"),
});
