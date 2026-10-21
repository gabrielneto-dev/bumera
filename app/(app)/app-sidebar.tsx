"use client";

import {
  CalendarDays,
  ClipboardList,
  LogOut,
  MessageSquareText,
  Receipt,
  Stethoscope,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "./theme-toggle";

export type NavIcon = "agenda" | "pacientes" | "pendentes" | "dentistas" | "procedimentos" | "equipe" | "orcamentos" | "mensagens";
export type NavGroup = "Rotina" | "Cadastros" | "Clínica";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  group: NavGroup;
}

const ICONS: Record<NavIcon, LucideIcon> = {
  agenda: CalendarDays,
  pacientes: Users,
  pendentes: ClipboardList,
  dentistas: UserRound,
  procedimentos: Stethoscope,
  equipe: UsersRound,
  orcamentos: Receipt,
  mensagens: MessageSquareText,
};

const GROUP_ORDER: NavGroup[] = ["Rotina", "Cadastros", "Clínica"];

interface AppSidebarProps {
  items: NavItem[];
  clinicName: string;
  userName: string;
  userEmail: string;
}

export function AppSidebar({ items, clinicName, userName, userEmail }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-heading text-lg text-sidebar-primary-foreground"
          >
            B
          </span>
          <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <p className="truncate font-heading text-base text-sidebar-accent-foreground">Bumera</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{clinicName}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Principal" className="contents">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {groupItems.map((item) => {
                      const Icon = ICONS[item.icon];
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            isActive={isActive}
                            tooltip={item.label}
                            render={
                              <Link
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                onClick={() => isMobile && setOpenMobile(false)}
                              />
                            }
                          >
                            <Icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground"
              >
                {userName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm text-sidebar-accent-foreground">{userName}</p>
                <p className="truncate text-xs text-sidebar-foreground/70">{userEmail}</p>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={signOut} disabled={isSigningOut}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
