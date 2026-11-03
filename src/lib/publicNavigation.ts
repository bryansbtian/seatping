import { useCallback } from "react";
import {
  useNavigate as useRouterNavigate,
  useLocation as useRouterLocation,
  type NavigateOptions,
  type To,
} from "react-router-dom";
import { usePublicLanguage, localizeTo } from "@/lib/publicLanguage";
import { unlocalizedPath } from "@shared/publicLanguage";

export { useParams, useSearchParams } from "react-router-dom";
export { Link, Navigate } from "@/components/PublicLink";

export function useNavigate() {
  const navigate = useRouterNavigate();
  const { lang, explicitEnglish } = usePublicLanguage();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        return navigate(to);
      }
      return navigate(localizeTo(to, lang, explicitEnglish), options);
    },
    [navigate, lang, explicitEnglish],
  );
}

export function useLocation() {
  const location = useRouterLocation();
  return { ...location, pathname: unlocalizedPath(location.pathname) };
}
