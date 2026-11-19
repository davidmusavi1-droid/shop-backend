'use strict';
// Unit-route fixtures model transactions and an empty numeric-code registry.
// Real collision/concurrency behavior is exercised by the PostgreSQL acceptance test.
module.exports = function productDbFixture(db) {
  const prepare = tx => {
    tx.$queryRaw ||= async () => [];
    tx.smartCode ||= { findMany: async () => [] };
    tx.smartDossier ||= { findUnique: async () => null };
    if (db.product?.create && tx.product && !tx.product.create) tx.product.create = db.product.create;
    return tx;
  };
  const transaction = db.$transaction;
  prepare(db);
  db.$transaction = fn => transaction ? transaction(tx => fn(prepare(tx))) : fn(db);
  return db;
};
