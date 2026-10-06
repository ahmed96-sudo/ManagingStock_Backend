import { Decimal } from 'decimal.js';
import type { Numeric } from '@prisma/orm-postgres/target/codec-types';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type Dec = Decimal.Value;

// The DB returns numerics as (branded) strings; these produce correctly branded values for writes.
export type MoneyT = Numeric<14, 2>;
export type QtyT = Numeric<14, 3>;
export type RateT = Numeric<5, 2>;

export const D = (v: Dec) => new Decimal(v);
export const money = (v: Dec) => D(v).toFixed(2) as MoneyT;
export const qty = (v: Dec) => D(v).toFixed(3) as QtyT;
export const rate = (v: Dec) => D(v).toFixed(2) as RateT;
export const sum = (values: Dec[]) => values.reduce<Decimal>((a, v) => a.plus(v), D(0));
