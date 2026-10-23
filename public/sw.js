// Service worker de Almacenia (22-notificaciones.md): solo notificaciones push.
// No cachea nada: los datos siempre son en vivo (00-overview.md, "Sin caché").

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { title: "Almacenia", body: event.data ? event.data.text() : "" };
  }
  const titulo = datos.title || "Almacenia";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.body || "",
      icon: "/icons/icono-192.png",
      badge: "/icons/icono-192.png",
      data: { url: datos.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url === destino && "focus" in v) return v.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
