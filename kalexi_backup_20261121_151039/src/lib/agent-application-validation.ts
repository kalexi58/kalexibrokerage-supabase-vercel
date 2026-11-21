import { z } from "zod";

export const expectedApplicationUpdatedAtSchema = z
  .string()
  .datetime({ offset: true });

const optionalApplicationDate = z
  .string()
  .trim()
  .max(10)
  .refine((value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.")
  .transform((value) => value || null);

const optionalApplicationText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);

export const updateAgentApplicationSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: expectedApplicationUpdatedAtSchema,
  full_name: z.string().trim().min(2).max(140),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(254),
  date_of_birth: optionalApplicationDate,
  gender: optionalApplicationText(50),
  nationality: optionalApplicationText(100),
  address: optionalApplicationText(500),
  district: optionalApplicationText(100),
  village: optionalApplicationText(100),
  occupation: optionalApplicationText(120),
  id_type: z.string().trim().min(1).max(80),
  id_number: z.string().trim().min(1).max(100),
  payment_method: z.string().trim().min(1).max(80),
  payment_provider: optionalApplicationText(100),
  payment_account_name: optionalApplicationText(140),
  payment_account_number: optionalApplicationText(120),
});

export type UpdateAgentApplicationInput = z.input<typeof updateAgentApplicationSchema>;
export type UpdateAgentApplicationFields = Omit<
  UpdateAgentApplicationInput,
  "id" | "expectedUpdatedAt"
>;
