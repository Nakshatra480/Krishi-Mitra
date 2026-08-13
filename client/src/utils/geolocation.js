/**
 * Thin promise wrapper over the browser Geolocation API.
 *
 * Every failure path resolves to a message the farmer can act on, in both
 * languages — "GeolocationPositionError code 1" helps nobody standing in a
 * field. Callers only ever see { lat, lon, accuracyM } or an Error with a
 * ready-to-render `.message`.
 */

const OPTIONS = {
  // Worth the extra second and battery: on a phone this is the difference
  // between the actual field and the nearest cell tower.
  enableHighAccuracy: true,
  timeout: 20000,
  // A fix from the last two minutes is fine — the farmer has not moved
  // districts, and reusing it makes the button feel instant.
  maximumAge: 120000,
};

const MESSAGES = {
  unsupported: 'यह ब्राउज़र स्थान नहीं बता सकता / This browser cannot share location',
  insecure: 'स्थान के लिए सुरक्षित (https) पेज चाहिए / Location needs a secure (https) page',
  denied:
    'स्थान की अनुमति नहीं मिली — ब्राउज़र सेटिंग में अनुमति दें, या नीचे गाँव खोजें / Location permission denied — allow it in browser settings, or search your village below',
  unavailable:
    'स्थान नहीं मिल पाया — खुले आसमान के नीचे जाएँ, या नीचे गाँव खोजें / Could not get a fix — try under open sky, or search your village below',
  timeout:
    'स्थान लेने में देर हो गई — दोबारा कोशिश करें, या नीचे गाँव खोजें / Location timed out — try again, or search your village below',
};

function messageFor(err) {
  switch (err?.code) {
    case 1: // PERMISSION_DENIED
      return MESSAGES.denied;
    case 2: // POSITION_UNAVAILABLE
      return MESSAGES.unavailable;
    case 3: // TIMEOUT
      return MESSAGES.timeout;
    default:
      return MESSAGES.unavailable;
  }
}

export function isGeolocationAvailable() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error(MESSAGES.unsupported));
      return;
    }
    // Browsers block geolocation outside secure contexts, and the resulting
    // error is indistinguishable from a denial — check first so we can say why.
    if (!window.isSecureContext) {
      reject(new Error(MESSAGES.insecure));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => reject(new Error(messageFor(err))),
      OPTIONS
    );
  });
}
