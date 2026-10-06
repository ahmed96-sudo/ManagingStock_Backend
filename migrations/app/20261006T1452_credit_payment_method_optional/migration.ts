#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1f84400ac5d6dd529bc0443dc74819b3ec57fc8a2768e88adcb4af79edcb5c7e/contract';
import startContract from '../../snapshots/1f84400ac5d6dd529bc0443dc74819b3ec57fc8a2768e88adcb4af79edcb5c7e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c8ebc537fa581aca44dbd1f363172b42679af2660af316b31b792397d91015e3/contract';
import endContract from '../../snapshots/c8ebc537fa581aca44dbd1f363172b42679af2660af316b31b792397d91015e3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropNotNull({ schema: 'public', table: 'creditPayments', column: 'method' })];
  }
}

MigrationCLI.run(import.meta.url, M);
