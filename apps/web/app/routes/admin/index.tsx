import { redirect } from "react-router";
import { webModules } from "../../site-modules";

/** Start on operational health when no module provides a dedicated landing page. */
export function loader() {
  throw redirect(webModules().find((m) => m.admin?.landing)?.admin?.landing ?? "/admin/runs");
}

export default function AdminIndex() {
  return null;
}
