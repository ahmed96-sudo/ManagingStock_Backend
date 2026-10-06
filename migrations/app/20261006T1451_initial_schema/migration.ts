#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1f84400ac5d6dd529bc0443dc74819b3ec57fc8a2768e88adcb4af79edcb5c7e/contract';
import endContract from '../../snapshots/1f84400ac5d6dd529bc0443dc74819b3ec57fc8a2768e88adcb4af79edcb5c7e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'categories',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'clientGroups',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'clients',
        columns: [
          col('address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('groupId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('ice', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'companyInfo',
        columns: [
          col('address', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('businessLicense', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('commercialRegister', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('commonBusinessId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('defaultTvaRate', 'numeric(5,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('logoPath', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('phoneNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('socialSecurityNo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('taxIdNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'creditPayments',
        columns: [
          col('amount', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('creditId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'creditPayments_method_check_f7d63ca3',
            "\"method\" IN ('cash', 'cheque')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'credits',
        columns: [
          col('amount', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('clientId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('documentId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('supplierId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('supplierInvoiceId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'credits_one_party_c237646c',
            'num_nonnulls("clientId", "supplierId") = 1',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'documentCounters',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastSeq', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('year', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'documentCounters_type_check_06310384',
            "\"type\" IN ('invoice', 'draft', 'delivery_note', 'uninvoiced', 'credit_note')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'documentLines',
        columns: [
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('discountPercent', 'numeric(5,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('documentId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lineSubtotal', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('lineTotal', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('productId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('quantity', 'numeric(14,3)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 3 } },
          }),
          col('tvaAmount', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('tvaRate', 'numeric(5,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('unitCost', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('unitPrice', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'documents',
        columns: [
          col('clientId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('discountTotal', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('documentDate', 'date', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('number', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('relatedDocumentId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('seq', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('subtotal', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('total', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('tvaTotal', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('year', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'documents_type_check_06310384',
            "\"type\" IN ('invoice', 'draft', 'delivery_note', 'uninvoiced', 'credit_note')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'expenses',
        columns: [
          col('amount', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expenseDate', 'date', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'notifications',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isRead', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('productId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', {
            notNull: true,
            default: lit('info'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('notifications_type_check_963f008b', "\"type\" IN ('low_stock', 'info')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'payments',
        columns: [
          col('amount', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('bank', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('chequeNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('clientId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('documentId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('supplierId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('supplierInvoiceId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('payments_method_check_f7d63ca3', "\"method\" IN ('cash', 'cheque')"),
          checkExpression(
            'payments_one_party_407d43ed',
            'num_nonnulls("clientId", "supplierId") <= 1',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'products',
        columns: [
          col('barcode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('categoryId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('imagePath', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('minQtyAlert', 'numeric(14,3)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 3 } },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('packaging', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('purchasePrice', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('quantity', 'numeric(14,3)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 3 } },
          }),
          col('quotePrice', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sellingPrice', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('supplierId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('unit', 'text', {
            notNull: true,
            default: lit('unit'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('products_quantity_nonneg_6553cc0b', 'quantity >= 0'),
          checkExpression('products_unit_check_b8b650e6', "\"unit\" IN ('kg', 'm', 'unit')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'session',
        columns: [
          col('expire', 'timestamptz(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1', typeParams: { precision: 6 } },
          }),
          col('sess', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('sid', 'character varying', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1' },
          }),
        ],
        constraints: [primaryKey(['sid'], { name: 'session_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'stockMovements',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('documentId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('productId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('quantity', 'numeric(14,3)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 3 } },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('unitCost', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('unitPrice', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'stockMovements_type_check_41e1afbb',
            "\"type\" IN ('purchase', 'sale', 'return', 'adjust')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'supplierInvoices',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('invoiceDate', 'date', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('reference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('supplierId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('total', 'numeric(14,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 14, scale: 2 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'suppliers',
        columns: [
          col('activities', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('companyName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('fax', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('phone1', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone2', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('cashier'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'users_role_check_0ed15a98',
            "\"role\" IN ('admin', 'manager', 'finance', 'stock', 'cashier')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'categories',
        constraint: 'categories_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'clientGroups',
        constraint: 'clientGroups_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'clients',
        constraint: 'clients_ice_key',
        columns: ['ice'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'documentCounters',
        constraint: 'documentCounters_type_year_key',
        columns: ['type', 'year'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'documents',
        constraint: 'documents_number_key',
        columns: ['number'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'documents',
        constraint: 'documents_type_year_seq_key',
        columns: ['type', 'year', 'seq'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'products',
        constraint: 'products_barcode_key',
        columns: ['barcode'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'clients',
        index: 'clients_groupId_idx_e2fb5578',
        columns: ['groupId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'creditPayments',
        index: 'creditPayments_creditId_idx_0fadb124',
        columns: ['creditId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'credits',
        index: 'credits_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'credits',
        index: 'credits_documentId_idx_825ef746',
        columns: ['documentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'credits',
        index: 'credits_supplierId_idx_c4d9a8b9',
        columns: ['supplierId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'credits',
        index: 'credits_supplierInvoiceId_idx_7f6ba885',
        columns: ['supplierInvoiceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documentLines',
        index: 'documentLines_documentId_idx_825ef746',
        columns: ['documentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documentLines',
        index: 'documentLines_productId_idx_5858600a',
        columns: ['productId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documents',
        index: 'documents_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documents',
        index: 'documents_relatedDocumentId_idx_1ca093ad',
        columns: ['relatedDocumentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documents',
        index: 'documents_type_documentDate_idx_f7e82740',
        columns: ['type', 'documentDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documents',
        index: 'documents_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'expenses',
        index: 'expenses_expenseDate_idx_4f88c6df',
        columns: ['expenseDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_productId_idx_5858600a',
        columns: ['productId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_clientId_idx_153a9a49',
        columns: ['clientId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_documentId_idx_825ef746',
        columns: ['documentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_method_createdAt_idx_57c495f2',
        columns: ['method', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_supplierId_idx_c4d9a8b9',
        columns: ['supplierId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_supplierInvoiceId_idx_7f6ba885',
        columns: ['supplierInvoiceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'products',
        index: 'products_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'products',
        index: 'products_reference_idx_313dc7c9',
        columns: ['reference'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'products',
        index: 'products_supplierId_idx_c4d9a8b9',
        columns: ['supplierId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'session',
        index: 'IDX_session_expire',
        columns: ['expire'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stockMovements',
        index: 'stockMovements_documentId_idx_825ef746',
        columns: ['documentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stockMovements',
        index: 'stockMovements_productId_createdAt_idx_58d1a09b',
        columns: ['productId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stockMovements',
        index: 'stockMovements_productId_idx_5858600a',
        columns: ['productId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'supplierInvoices',
        index: 'supplierInvoices_supplierId_idx_c4d9a8b9',
        columns: ['supplierId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'clients',
        foreignKey: {
          name: 'clients_groupId_fkey',
          columns: ['groupId'],
          references: { schema: 'public', table: 'clientGroups', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'creditPayments',
        foreignKey: {
          name: 'creditPayments_creditId_fkey',
          columns: ['creditId'],
          references: { schema: 'public', table: 'credits', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'credits',
        foreignKey: {
          name: 'credits_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'clients', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'credits',
        foreignKey: {
          name: 'credits_supplierId_fkey',
          columns: ['supplierId'],
          references: { schema: 'public', table: 'suppliers', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'credits',
        foreignKey: {
          name: 'credits_documentId_fkey',
          columns: ['documentId'],
          references: { schema: 'public', table: 'documents', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'credits',
        foreignKey: {
          name: 'credits_supplierInvoiceId_fkey',
          columns: ['supplierInvoiceId'],
          references: { schema: 'public', table: 'supplierInvoices', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documentLines',
        foreignKey: {
          name: 'documentLines_documentId_fkey',
          columns: ['documentId'],
          references: { schema: 'public', table: 'documents', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documentLines',
        foreignKey: {
          name: 'documentLines_productId_fkey',
          columns: ['productId'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documents',
        foreignKey: {
          name: 'documents_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'clients', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documents',
        foreignKey: {
          name: 'documents_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documents',
        foreignKey: {
          name: 'documents_relatedDocumentId_fkey',
          columns: ['relatedDocumentId'],
          references: { schema: 'public', table: 'documents', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_productId_fkey',
          columns: ['productId'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'payments_documentId_fkey',
          columns: ['documentId'],
          references: { schema: 'public', table: 'documents', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'payments_supplierInvoiceId_fkey',
          columns: ['supplierInvoiceId'],
          references: { schema: 'public', table: 'supplierInvoices', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'payments_clientId_fkey',
          columns: ['clientId'],
          references: { schema: 'public', table: 'clients', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'payments',
        foreignKey: {
          name: 'payments_supplierId_fkey',
          columns: ['supplierId'],
          references: { schema: 'public', table: 'suppliers', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'products',
        foreignKey: {
          name: 'products_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'categories', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'products',
        foreignKey: {
          name: 'products_supplierId_fkey',
          columns: ['supplierId'],
          references: { schema: 'public', table: 'suppliers', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stockMovements',
        foreignKey: {
          name: 'stockMovements_productId_fkey',
          columns: ['productId'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stockMovements',
        foreignKey: {
          name: 'stockMovements_documentId_fkey',
          columns: ['documentId'],
          references: { schema: 'public', table: 'documents', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'supplierInvoices',
        foreignKey: {
          name: 'supplierInvoices_supplierId_fkey',
          columns: ['supplierId'],
          references: { schema: 'public', table: 'suppliers', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
