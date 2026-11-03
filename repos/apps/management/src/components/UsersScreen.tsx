import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, TextInput, Modal, ScrollView } from "react-native";
import UserCheck from "lucide-react-native/icons/user-check";
import UserPlus from "lucide-react-native/icons/user-plus";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import KeyRound from "lucide-react-native/icons/key-round";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import AlertTriangle from "lucide-react-native/icons/triangle-alert";
import X from "lucide-react-native/icons/x";
import Check from "lucide-react-native/icons/check";
import { isWeakPin } from "@tiendita/contracts";

export type StoreRoleCode = "OWNER" | "STORE_MANAGER" | "CASHIER" | "ACCOUNTANT";

export interface EmployeeItem {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: StoreRoleCode;
  pinSet: boolean;
  isLocked: boolean;
  branchName?: string;
}

export interface UsersScreenProps {
  employees: EmployeeItem[];
  onCreateEmployee: (params: {
    fullName: string;
    email: string;
    phone: string;
    role: StoreRoleCode;
    initialPin?: string;
  }) => Promise<void>;
  onToggleLock: (userId: string) => Promise<void>;
  onResetPin: (userId: string, newPin: string) => Promise<void>;
}

const ROLE_PERMISSIONS_MAP: Record<StoreRoleCode, string[]> = {
  OWNER: [
    "Acceso total administrativo y fiscal",
    "Apertura, arqueo y cierre de turnos",
    "Ventas, descuentos ilimitados y anulaciones",
    "Creación de usuarios y configuración de PIN",
    "Emisión de libro fiscal Art. 616 E.T. y facturas DIAN"
  ],
  STORE_MANAGER: [
    "Apertura, arqueos ciegos y cierre de turnos",
    "Ventas y descuentos hasta 15%",
    "Aprobación de devoluciones y cambios de producto",
    "Ajustes de inventario y recepción de compras",
    "Consulta de reportes de sucursal"
  ],
  CASHIER: [
    "Venta rápida y escaneo en caja (offline/online)",
    "Cobro en efectivo y medios digitales (Nequi, Daviplata)",
    "Registro de clientes y fiados dentro del cupo",
    "Abonos de cartera de fiados",
    "Arqueo ciego de su propio turno"
  ],
  ACCOUNTANT: [
    "Consulta y descarga del Libro Fiscal Diario (Art. 616 E.T.)",
    "Exportación de asientos contables PUC para Siigo/Alegra",
    "Consulta de facturas electrónicas y documentos POS",
    "Auditoría inmutable de transacciones (solo lectura)"
  ]
};

export function UsersScreen({
  employees,
  onCreateEmployee,
  onToggleLock,
  onResetPin
}: UsersScreenProps) {
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [resetPinUserId, setResetPinUserId] = useState<string | null>(null);

  // Formulario nuevo usuario
  const [formName, setFormName] = useState<string>("");
  const [formEmail, setFormEmail] = useState<string>("");
  const [formPhone, setFormPhone] = useState<string>("");
  const [formRole, setFormRole] = useState<StoreRoleCode>("CASHIER");
  const [formPin, setFormPin] = useState<string>("");
  const [formTouched, setFormTouched] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal reset PIN
  const [newPinValue, setNewPinValue] = useState<string>("");
  const [pinTouched, setPinTouched] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const activeCount = employees.filter((e) => !e.isLocked).length;
  const lockedCount = employees.filter((e) => e.isLocked).length;
  const withPinCount = employees.filter((e) => e.pinSet).length;

  const pinIsWeak = formPin.length > 0 && isWeakPin(formPin);
  const pinIsComplete = /^\d{4}$/.test(formPin);

  const resetPinIsWeak = newPinValue.length > 0 && isWeakPin(newPinValue);
  const resetPinIsComplete = /^\d{4}$/.test(newPinValue);

  const handleCreateSubmit = async () => {
    setFormTouched(true);
    if (!formName.trim()) {
      setErrorMsg("El nombre completo es requerido.");
      return;
    }
    if (formPin && (!pinIsComplete || pinIsWeak)) {
      setErrorMsg("El PIN debe tener exactamente 4 dígitos y no ser débil (ej. 1234, 0000).");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onCreateEmployee({
        fullName: formName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
        role: formRole,
        initialPin: formPin || undefined
      });
      setShowCreateModal(false);
      setFormName("");
      setFormEmail("");
      setFormPhone("");
      setFormPin("");
      setFormRole("CASHIER");
      setFormTouched(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al crear el empleado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPinSubmit = async () => {
    setPinTouched(true);
    if (!resetPinIsComplete || resetPinIsWeak) {
      setPinError("El PIN debe tener 4 dígitos no secuenciales ni repetidos.");
      return;
    }

    if (!resetPinUserId) return;
    setIsSubmitting(true);
    setPinError(null);
    try {
      await onResetPin(resetPinUserId, newPinValue);
      setResetPinUserId(null);
      setNewPinValue("");
      setPinTouched(false);
    } catch (err: any) {
      setPinError(err.message || "Error al actualizar el PIN.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container} testID="users-screen-root">
      {/* Encabezado */}
      <View style={styles.viewHeader}>
        <View>
          <Text role="heading" style={styles.viewTitle}>
            Cajeros y Empleados de Tienda
          </Text>
          <Text style={styles.viewSubtitle}>
            Accesos rápidos por PIN de 4 dígitos con sal única Argon2id y matriz de roles
          </Text>
        </View>
        <TouchableOpacity
          style={styles.actionBtnPrimary}
          onPress={() => setShowCreateModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Crear nuevo empleado o cajero"
          testID="btn-create-user"
        >
          <UserPlus size={18} color="#ffffff" aria-hidden />
          <Text style={styles.actionBtnPrimaryText}>Nuevo Empleado</Text>
        </TouchableOpacity>
      </View>

      {/* Tarjetas de Métricas de Empleados */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{employees.length}</Text>
          <Text style={styles.metricLabel}>Total Registrados</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, { color: "#16a34a" }]}>{activeCount}</Text>
          <Text style={styles.metricLabel}>Activos para Caja</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, { color: "#0284c7" }]}>{withPinCount}</Text>
          <Text style={styles.metricLabel}>Con PIN de 4 Dígitos</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, { color: lockedCount > 0 ? "#dc2626" : "#64748b" }]}>
            {lockedCount}
          </Text>
          <Text style={styles.metricLabel}>Bloqueados</Text>
        </View>
      </View>

      {/* Lista de Empleados */}
      <View style={styles.employeeList}>
        {employees.map((emp) => {
          const roleBadgeColor =
            emp.role === "OWNER"
              ? styles.roleBadgeOwner
              : emp.role === "STORE_MANAGER"
                ? styles.roleBadgeManager
                : emp.role === "ACCOUNTANT"
                  ? styles.roleBadgeAccountant
                  : styles.roleBadgeCashier;

          const roleTextColor =
            emp.role === "OWNER"
              ? styles.roleTextOwner
              : emp.role === "STORE_MANAGER"
                ? styles.roleTextManager
                : emp.role === "ACCOUNTANT"
                  ? styles.roleTextAccountant
                  : styles.roleTextCashier;

          return (
            <View key={emp.id} style={styles.employeeCard} testID={`user-card-${emp.id}`}>
              <View style={styles.employeeInfo}>
                <View style={styles.employeeTitleRow}>
                  <Text style={styles.employeeName}>{emp.fullName}</Text>
                  <View style={[styles.roleBadge, roleBadgeColor]}>
                    <Text style={[styles.roleBadgeText, roleTextColor]}>{emp.role}</Text>
                  </View>
                </View>

                <Text style={styles.employeeMeta}>
                  {emp.email ? emp.email : "Sin correo"} • {emp.phone ? emp.phone : "Sin celular"}
                </Text>

                <View style={styles.pinStatusRow}>
                  <KeyRound size={14} color={emp.pinSet ? "#16a34a" : "#d97706"} aria-hidden />
                  <Text style={[styles.pinStatusText, emp.pinSet ? styles.textGreen : styles.textAmber]}>
                    {emp.pinSet ? "PIN de caja activo (Argon2id)" : "Sin PIN para operar en caja"}
                  </Text>
                  <TouchableOpacity
                    style={styles.changePinLink}
                    onPress={() => setResetPinUserId(emp.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Cambiar PIN de ${emp.fullName}`}
                  >
                    <Text style={styles.changePinLinkText}>
                      {emp.pinSet ? "Cambiar PIN" : "Configurar PIN"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.employeeRightActions}>
                <TouchableOpacity
                  style={[styles.lockToggleBtn, emp.isLocked && styles.btnLocked]}
                  onPress={() => onToggleLock(emp.id)}
                  accessibilityRole="button"
                  accessibilityLabel={emp.isLocked ? "Desbloquear empleado" : "Bloquear empleado"}
                  testID={`btn-toggle-lock-${emp.id}`}
                >
                  {emp.isLocked ? (
                    <>
                      <Lock size={15} color="#dc2626" aria-hidden />
                      <Text style={styles.textLocked}>Bloqueado</Text>
                    </>
                  ) : (
                    <>
                      <LockOpen size={15} color="#15803d" aria-hidden />
                      <Text style={styles.textUnlocked}>Activo</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      {/* MODAL 1: Crear Nuevo Empleado */}
      {showCreateModal ? (
        <Modal
          visible={showCreateModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCreateModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard} accessibilityRole="dialog" accessibilityLabel="Crear Nuevo Empleado">
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <UserPlus size={18} color="#0284c7" aria-hidden />
                  <Text style={styles.modalTitle}>Crear Nuevo Empleado de Tienda</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowCreateModal(false)}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar modal"
                >
                  <X size={18} color="#64748b" aria-hidden />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Nombre Completo *:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ej. Martha Lucía Gómez"
                    value={formName}
                    onChangeText={setFormName}
                    testID="input-employee-name"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Correo Electrónico:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="martha@tiendita.co"
                    keyboardType="email-address"
                    value={formEmail}
                    onChangeText={setFormEmail}
                    testID="input-employee-email"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Teléfono Celular:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="+57 310 555 1234"
                    keyboardType="phone-pad"
                    value={formPhone}
                    onChangeText={setFormPhone}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Rol Operativo:</Text>
                  <View style={styles.roleGrid}>
                    {(
                      [
                        { id: "CASHIER", label: "Cajero", desc: "Ventas y cobro" },
                        { id: "STORE_MANAGER", label: "Administrador", desc: "Turnos y descuentos" },
                        { id: "ACCOUNTANT", label: "Contador", desc: "Solo reportes y libro fiscal" },
                        { id: "OWNER", label: "Dueño", desc: "Acceso total" }
                      ] as const
                    ).map((r) => {
                      const isSelected = formRole === r.id;
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[styles.roleSelectBtn, isSelected && styles.roleSelectBtnActive]}
                          onPress={() => setFormRole(r.id)}
                        >
                          <Text style={[styles.roleSelectTitle, isSelected && styles.roleSelectTitleActive]}>
                            {r.label}
                          </Text>
                          <Text style={styles.roleSelectDesc}>{r.desc}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Previsualización de Permisos */}
                <View style={styles.permissionPreviewBox}>
                  <Text style={styles.permTitle}>Permisos asignados a este rol:</Text>
                  {ROLE_PERMISSIONS_MAP[formRole].map((p, idx) => (
                    <View key={idx} style={styles.permRow}>
                      <Check size={12} color="#16a34a" aria-hidden />
                      <Text style={styles.permText}>{p}</Text>
                    </View>
                  ))}
                </View>

                {/* PIN Inicial para la Caja */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>PIN de Acceso a Caja (4 dígitos opcional):</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      formPin.length > 0 && pinIsWeak && styles.textInputError
                    ]}
                    placeholder="Ej. 7821"
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    value={formPin}
                    onChangeText={setFormPin}
                    testID="input-employee-pin"
                  />
                  {formPin.length > 0 && pinIsWeak ? (
                    <View style={styles.errorBanner}>
                      <AlertTriangle size={13} color="#dc2626" aria-hidden />
                      <Text style={styles.errorText}>
                        PIN débil detectado: Evita secuencias continuas (1234, 4321) o dígitos repetidos (1111, 0000).
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.hintText}>
                    🛡️ El PIN se cifra localmente mediante Argon2id con sal única por usuario y caja.
                  </Text>
                </View>

                {errorMsg ? (
                  <View style={styles.errorBanner}>
                    <AlertTriangle size={14} color="#dc2626" aria-hidden />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowCreateModal(false)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, (isSubmitting || (formPin.length > 0 && pinIsWeak)) && styles.btnDisabled]}
                    onPress={handleCreateSubmit}
                    disabled={isSubmitting || (formPin.length > 0 && pinIsWeak)}
                    testID="btn-save-user"
                  >
                    <Text style={styles.saveBtnText}>
                      {isSubmitting ? "Guardando..." : "Crear Empleado"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* MODAL 2: Resetear / Cambiar PIN */}
      {resetPinUserId ? (
        <Modal
          visible={!!resetPinUserId}
          transparent
          animationType="fade"
          onRequestClose={() => setResetPinUserId(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: 440 }]} accessibilityRole="dialog" accessibilityLabel="Cambiar PIN">
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <KeyRound size={18} color="#0284c7" aria-hidden />
                  <Text style={styles.modalTitle}>Asignar Nuevo PIN de 4 Dígitos</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setResetPinUserId(null)}
                  style={styles.closeBtn}
                >
                  <X size={18} color="#64748b" aria-hidden />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.fieldLabel}>Nuevo PIN de 4 Dígitos:</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: "700" },
                    pinTouched && resetPinIsWeak && styles.textInputError
                  ]}
                  placeholder="••••"
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                  value={newPinValue}
                  onChangeText={(val) => {
                    setPinTouched(true);
                    setPinError(null);
                    setNewPinValue(val.replace(/\D/g, ""));
                  }}
                  testID="input-reset-pin"
                />

                {pinTouched && resetPinIsWeak ? (
                  <View style={styles.errorBanner}>
                    <AlertTriangle size={13} color="#dc2626" aria-hidden />
                    <Text style={styles.errorText}>
                      PIN inseguro: Evita números consecutivos o repetidos.
                    </Text>
                  </View>
                ) : null}

                {pinError ? (
                  <View style={styles.errorBanner}>
                    <AlertTriangle size={14} color="#dc2626" aria-hidden />
                    <Text style={styles.errorText}>{pinError}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setResetPinUserId(null)}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      (!resetPinIsComplete || resetPinIsWeak || isSubmitting) && styles.btnDisabled
                    ]}
                    onPress={handleResetPinSubmit}
                    disabled={!resetPinIsComplete || resetPinIsWeak || isSubmitting}
                    testID="btn-confirm-reset-pin"
                  >
                    <Text style={styles.saveBtnText}>
                      {isSubmitting ? "Actualizando..." : "Guardar PIN"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%"
  },
  viewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },
  viewTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 22,
    color: "#0f172a",
    letterSpacing: -0.5
  },
  viewSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2
  },
  actionBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap"
  },
  metricCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14
  },
  metricValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 20,
    color: "#0f172a"
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  employeeList: {
    gap: 12
  },
  employeeCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    flexWrap: "wrap",
    gap: 12
  },
  employeeInfo: {
    gap: 3
  },
  employeeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  employeeName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#0f172a"
  },
  roleBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  roleBadgeOwner: {
    backgroundColor: "#f3e8ff"
  },
  roleBadgeManager: {
    backgroundColor: "#e0f2fe"
  },
  roleBadgeCashier: {
    backgroundColor: "#dcfce7"
  },
  roleBadgeAccountant: {
    backgroundColor: "#fef3c7"
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  roleTextOwner: {
    color: "#7e22ce"
  },
  roleTextManager: {
    color: "#0369a1"
  },
  roleTextCashier: {
    color: "#15803d"
  },
  roleTextAccountant: {
    color: "#b45309"
  },
  employeeMeta: {
    fontSize: 12,
    color: "#64748b"
  },
  pinStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4
  },
  pinStatusText: {
    fontSize: 11,
    fontWeight: "600"
  },
  textGreen: {
    color: "#15803d"
  },
  textAmber: {
    color: "#b45309"
  },
  changePinLink: {
    marginLeft: 6
  },
  changePinLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0284c7"
  },
  employeeRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  lockToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  btnLocked: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  textUnlocked: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803d"
  },
  textLocked: {
    fontSize: 12,
    fontWeight: "700",
    color: "#dc2626"
  },
  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: "90%"
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  modalTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: "#0f172a"
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#e2e8f0"
  },
  modalBody: {
    padding: 20
  },
  fieldGroup: {
    marginBottom: 14
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#ffffff"
  },
  textInputError: {
    borderColor: "#dc2626",
    color: "#dc2626"
  },
  hintText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4
  },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  roleSelectBtn: {
    flex: 1,
    minWidth: 180,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc"
  },
  roleSelectBtnActive: {
    borderColor: "#0284c7",
    backgroundColor: "#f0f9ff"
  },
  roleSelectTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155"
  },
  roleSelectTitleActive: {
    color: "#0369a1"
  },
  roleSelectDesc: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  permissionPreviewBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    gap: 6
  },
  permTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4
  },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  permText: {
    fontSize: 11,
    color: "#334155"
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 8,
    borderRadius: 6,
    marginTop: 6
  },
  errorText: {
    fontSize: 11,
    color: "#dc2626",
    flex: 1
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
    paddingBottom: 8
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1"
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b"
  },
  saveBtn: {
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff"
  },
  btnDisabled: {
    opacity: 0.5
  }
});
