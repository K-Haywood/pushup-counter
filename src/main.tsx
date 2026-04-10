import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const NEW_VERSION_EVENT = 'pushup-counter:new-version-available';

type NewVersionDetail = {
  registration: ServiceWorkerRegistration;
};

function dispatchNewVersionEvent(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(
    new CustomEvent<NewVersionDetail>(NEW_VERSION_EVENT, {
      detail: { registration }
    })
  );
}

async function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('./sw.js');

    const emitIfWaiting = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        dispatchNewVersionEvent(registration);
      }
    };

    const watchInstallingWorker = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) {
        emitIfWaiting();
        return;
      }

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          dispatchNewVersionEvent(registration);
        }
      });
    };

    registration.addEventListener('updatefound', watchInstallingWorker);
    emitIfWaiting();

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    window.addEventListener('focus', () => {
      void registration.update().catch(() => {});
    });

    void registration.update().catch(() => {});
  } catch {
    // Service worker not supported or blocked — app works without it
  }
}

void registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
