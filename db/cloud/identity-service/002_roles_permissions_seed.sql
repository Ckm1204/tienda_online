-- identity-service: permisos atómicos y roles de sistema.

INSERT INTO permissions (code, description) VALUES
 ('platform.tenants.manage',     'Crear y administrar tiendas (solo super admin)'),
 ('platform.billing.manage',     'Registrar pagos, prórrogas, suspensiones (solo super admin)'),
 ('platform.local_licenses.manage','Generar y transferir licencias de la Edición Local (solo super admin)'),
 ('platform.users.manage',       'Crear usuarios en cualquier tienda (solo super admin)'),
 ('sale.create',                 'Vender y cobrar'),
 ('sale.discount.line',          'Descuento hasta el tope configurado'),
 ('sale.discount.extraordinary', 'Descuento mayor al tope'),
 ('sale.price.override',         'Cambiar precio en caja'),
 ('sale.generic_item',           'Vender artículo genérico'),
 ('cart.item.remove_after_scan', 'Eliminar ítem ya escaneado'),
 ('sale.void',                   'Anular venta'),
 ('sale.return',                 'Devoluciones'),
 ('receipt.reprint',             'Reimprimir comprobante'),
 ('drawer.open.manual',          'Abrir cajón sin venta'),
 ('cash.session.open_close',     'Abrir y cerrar turno'),
 ('cash.session.reopen',         'Reabrir turno'),
 ('cash.session.view_expected',  'Ver efectivo esperado'),
 ('cash.movement.out',           'Salidas de efectivo sobre el umbral'),
 ('credit.sale',                 'Vender fiado dentro del cupo'),
 ('credit.exceed_limit',         'Fiar por encima del cupo'),
 ('credit.payment',              'Recibir abonos'),
 ('customer.quick_create',       'Crear cliente rápido en caja'),
 ('customer.manage',             'Editar clientes y cupos'),
 ('catalog.manage',              'Productos, categorías, impuestos'),
 ('price.manage',                'Precios y promociones'),
 ('inventory.manage',            'Recepciones, ajustes, conteos'),
 ('inventory.transfer',          'Traslados entre sucursales'),
 ('users.manage',                'Usuarios de la tienda'),
 ('roles.manage',                'Roles personalizados'),
 ('terminals.manage',            'Crear y revocar cajas'),
 ('reports.shift',               'Reporte del turno / caja'),
 ('reports.view',                'Reportes de sucursal o globales'),
 ('reports.financial',           'Costos y márgenes'),
 ('reports.export',              'Exportar Excel/PDF'),
 ('audit.view',                  'Ver auditoría'),
 ('subscription.manage',         'Ver y pagar la suscripción')
ON CONFLICT (code) DO NOTHING;

-- Roles de sistema (tenant_id NULL). Los planes limitan cuáles se pueden asignar (plans.allowed_roles).
INSERT INTO roles (id, tenant_id, code, name) VALUES
 (gen_random_uuid(), NULL, 'SUPER_ADMIN',  'Super administrador'),
 (gen_random_uuid(), NULL, 'SUPPORT',      'Soporte de plataforma'),
 (gen_random_uuid(), NULL, 'OWNER',        'Dueño de tienda'),
 (gen_random_uuid(), NULL, 'BRANCH_ADMIN', 'Administrador de sucursal'),
 (gen_random_uuid(), NULL, 'SUPERVISOR',   'Supervisor'),
 (gen_random_uuid(), NULL, 'ACCOUNTANT',   'Contador (solo lectura)'),
 (gen_random_uuid(), NULL, 'CASHIER',      'Cajero')
ON CONFLICT (tenant_id, code) DO NOTHING;

WITH grants(role_code, perms) AS (VALUES
 ('SUPER_ADMIN', ARRAY['platform.tenants.manage','platform.billing.manage','platform.local_licenses.manage',
                       'platform.users.manage']),
 ('SUPPORT',     ARRAY[]::text[]),  -- solo acceso JIT de lectura, concedido por sesión
 ('OWNER',       ARRAY['sale.create','sale.discount.line','sale.discount.extraordinary','sale.price.override',
                       'sale.generic_item','cart.item.remove_after_scan','sale.void','sale.return','receipt.reprint',
                       'drawer.open.manual','cash.session.open_close','cash.session.reopen','cash.session.view_expected',
                       'cash.movement.out','credit.sale','credit.exceed_limit','credit.payment','customer.quick_create',
                       'customer.manage','catalog.manage','price.manage','inventory.manage','inventory.transfer',
                       'users.manage','roles.manage','terminals.manage','reports.shift','reports.view',
                       'reports.financial','reports.export','audit.view','subscription.manage']),
 ('BRANCH_ADMIN',ARRAY['sale.create','sale.discount.line','sale.discount.extraordinary','sale.price.override',
                       'sale.generic_item','cart.item.remove_after_scan','sale.void','sale.return','receipt.reprint',
                       'drawer.open.manual','cash.session.open_close','cash.session.reopen','cash.session.view_expected',
                       'cash.movement.out','credit.sale','credit.exceed_limit','credit.payment','customer.quick_create',
                       'customer.manage','inventory.manage','users.manage','reports.shift','reports.view','reports.export']),
 ('SUPERVISOR',  ARRAY['sale.create','sale.discount.line','sale.discount.extraordinary','sale.price.override',
                       'sale.generic_item','cart.item.remove_after_scan','sale.void','sale.return','receipt.reprint',
                       'drawer.open.manual','cash.session.open_close','cash.session.reopen','cash.movement.out',
                       'credit.sale','credit.exceed_limit','credit.payment','customer.quick_create','reports.shift']),
 ('ACCOUNTANT',  ARRAY['reports.view','reports.financial','reports.export']),
 ('CASHIER',     ARRAY['sale.create','sale.discount.line','cart.item.remove_after_scan','receipt.reprint',
                       'cash.session.open_close','credit.sale','credit.payment','customer.quick_create','reports.shift'])
)
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p FROM grants g
JOIN roles r ON r.code = g.role_code AND r.tenant_id IS NULL
CROSS JOIN LATERAL unnest(g.perms) AS p
ON CONFLICT DO NOTHING;

-- Ámbito: SUPER_ADMIN/SUPPORT viven con users.tenant_id = NULL; el resto siempre con tenant.
-- identity-service rechaza asignar un rol que no esté en plans.allowed_roles del tenant (réplica por eventos).
