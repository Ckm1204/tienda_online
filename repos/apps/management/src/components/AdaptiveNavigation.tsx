import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import ShoppingBag from "lucide-react-native/icons/shopping-bag";
import Package from "lucide-react-native/icons/package";
import Users from "lucide-react-native/icons/users";
import Monitor from "lucide-react-native/icons/monitor";
import UserCheck from "lucide-react-native/icons/user-check";
import User from "lucide-react-native/icons/user";
import Scale from "lucide-react-native/icons/scale";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import type { ManagementUser } from "../auth/auth-state";

export type NavigationSection =
  | "dashboard"
  | "catalog"
  | "inventory"
  | "customers"
  | "terminals"
  | "users"
  | "fiscal"
  | "profile"
  | "platform";

export interface NavigationItem {
  id: NavigationSection;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; "aria-hidden"?: boolean }>;
  requiredPermission?: string;
  disallowedRoles?: string[];
  allowedRoles?: string[];
}

export const ALL_NAV_ITEMS: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, requiredPermission: "reports.read" },
  { id: "catalog", label: "Catálogo", icon: ShoppingBag, requiredPermission: "catalog.read", disallowedRoles: ["ACCOUNTANT"] },
  { id: "inventory", label: "Inventario", icon: Package, requiredPermission: "inventory.read", disallowedRoles: ["ACCOUNTANT"] },
  { id: "customers", label: "Clientes", icon: Users, requiredPermission: "customer.read", disallowedRoles: ["ACCOUNTANT"] },
  { id: "terminals", label: "Cajas", icon: Monitor, requiredPermission: "terminal.read", disallowedRoles: ["ACCOUNTANT"] },
  { id: "users", label: "Empleados", icon: UserCheck, requiredPermission: "user.read", disallowedRoles: ["ACCOUNTANT"] },
  { id: "fiscal", label: "Libro Fiscal", icon: Scale, requiredPermission: "reports.read" },
  { id: "profile", label: "Mi Perfil", icon: User },
  { id: "platform", label: "Plataforma SaaS", icon: ShieldCheck, allowedRoles: ["SUPER_ADMIN"] }
];

export function resolveVisibleNavItems(user: ManagementUser): NavigationItem[] {
  return ALL_NAV_ITEMS.filter((item) => {
    if (item.allowedRoles && !item.allowedRoles.includes(user.roleCode)) {
      return false;
    }
    if (item.disallowedRoles && item.disallowedRoles.includes(user.roleCode)) {
      return false;
    }
    if (!item.requiredPermission) {
      return true;
    }
    if (user.roleCode === "OWNER" || user.roleCode === "SUPER_ADMIN") {
      return true;
    }
    return user.permissions.includes(item.requiredPermission);
  });
}

export interface AdaptiveNavigationProps {
  user: ManagementUser;
  activeSection: NavigationSection;
  onSelectSection: (section: NavigationSection) => void;
  children?: React.ReactNode;
}

export function AdaptiveNavigation({
  user,
  activeSection,
  onSelectSection,
  children
}: AdaptiveNavigationProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const items = resolveVisibleNavItems(user);

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer} testID="navigation-desktop">
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Menú</Text>
          <View style={styles.sidebarList}>
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                  onPress={() => onSelectSection(item.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  testID={`nav-item-${item.id}`}
                >
                  <Icon size={20} color={isActive ? "#24734e" : "#69656c"} aria-hidden />
                  <Text style={[styles.sidebarItemText, isActive && styles.sidebarItemTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.desktopContent}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.mobileContainer} testID="navigation-mobile">
      <View style={styles.mobileContent}>{children}</View>
      <View style={styles.bottomBar}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.bottomBarItem, isActive && styles.bottomBarItemActive]}
              onPress={() => onSelectSection(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              testID={`nav-item-${item.id}`}
            >
              <Icon size={20} color={isActive ? "#24734e" : "#69656c"} aria-hidden />
              <Text style={[styles.bottomBarText, isActive && styles.bottomBarTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: "row"
  },
  sidebar: {
    width: 240,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e0e5e1",
    padding: 16,
    gap: 16
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#69656c",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  sidebarList: {
    gap: 8
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  sidebarItemActive: {
    backgroundColor: "#e8f4ed"
  },
  sidebarItemText: {
    fontSize: 14,
    color: "#27242b"
  },
  sidebarItemTextActive: {
    color: "#24734e",
    fontWeight: "600"
  },
  desktopContent: {
    flex: 1,
    padding: 24
  },
  mobileContainer: {
    flex: 1
  },
  mobileContent: {
    flex: 1,
    padding: 16
  },
  bottomBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e0e5e1",
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: "space-around"
  },
  bottomBarItem: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4
  },
  bottomBarItemActive: {},
  bottomBarText: {
    fontSize: 10,
    color: "#69656c"
  },
  bottomBarTextActive: {
    color: "#24734e",
    fontWeight: "600"
  }
});

