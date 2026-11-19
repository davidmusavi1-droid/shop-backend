-- Read-only catalog audit. Do not print customer/order rows or connection credentials.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_setting('server_version') AS server_version, current_database() AS database_name;
SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid,a.atttypmod) AS data_type, a.attnotnull AS not_null,
       pg_get_expr(d.adbin,d.adrelid) AS column_default
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN
('Product','Variant','Customer','Order','OrderItem','Payment','CheckoutReservation','ShippingSettings',
 'CardTransfer','CardTransferSettings','OrderTrackingChallenge','ZibalAttempt')
ORDER BY c.relname,a.attnum;
SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
('Order','Payment','CheckoutReservation','ShippingSettings','CardTransfer','CardTransferSettings','OrderTrackingChallenge','ZibalAttempt')
ORDER BY c.relname,con.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN
('Order','Payment','CheckoutReservation','ShippingSettings','CardTransfer','CardTransferSettings','OrderTrackingChallenge','ZibalAttempt')
ORDER BY tablename,indexname;
COMMIT;
