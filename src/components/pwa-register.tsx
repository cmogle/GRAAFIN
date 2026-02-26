"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        void registration.update();
      })
      .catch(() => {
        // service worker registration is optional in local/dev contexts
      });

    const onControllerChange = () => {
      if (sessionStorage.getItem("graafin_sw_reloaded_v1") === "1") return;
      sessionStorage.setItem("graafin_sw_reloaded_v1", "1");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
