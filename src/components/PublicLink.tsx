import { forwardRef } from "react";
import {
  Link as RouterLink,
  Navigate as RouterNavigate,
  type LinkProps,
  type NavigateProps,
} from "react-router-dom";
import { usePublicLanguage, localizeTo } from "@/lib/publicLanguage";

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, ...props }, ref) {
  const { lang, explicitEnglish } = usePublicLanguage();
  return <RouterLink {...props} ref={ref} to={localizeTo(to, lang, explicitEnglish)} />;
});

export function Navigate({ to, ...props }: NavigateProps) {
  const { lang, explicitEnglish } = usePublicLanguage();
  return <RouterNavigate {...props} to={localizeTo(to, lang, explicitEnglish)} />;
}
