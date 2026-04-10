import { redirect } from "next/navigation";

export default function PortalLayout({ children: _children }: { children: React.ReactNode }) {
  redirect("/login");
}
