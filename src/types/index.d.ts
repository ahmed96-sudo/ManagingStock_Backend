import 'express-session';

declare module 'express-session' {
    interface SessionData {
        csrf: string;
        userId: number;
        role: 'admin' | 'manager' | 'finance' | 'stock' | 'cashier';
    }
}
