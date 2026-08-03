/**
 * Acciones que quedan registradas en `AuditLog.action`.
 *
 * Vive fuera de `AccountStatusService` porque ya hay dos escritores (el ciclo de
 * vida de la cuenta y la revocación de sesiones desde el admin) y un lector
 * (`AdminUsersService.getUserAuditLog`): la lista de acciones tiene que ser la
 * misma para todos.
 *
 * Convención de las filas de usuario: `AuditLog.userId` es quien **actúa** y
 * `AuditLog.entityId` el usuario **objetivo**, con `entityType: 'User'`.
 */
export const AUDIT_ACTION = {
  banned: 'user.banned',
  reactivated: 'user.reactivated',
  deactivated: 'user.deactivated',
  deactivatedInactivity: 'user.deactivated_inactivity',
  softDeleted: 'user.soft_deleted',
  restored: 'user.restored',
  anonymized: 'user.anonymized',
  sessionRevoked: 'user.session_revoked',
  sessionsRevokedAll: 'user.sessions_revoked_all',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
