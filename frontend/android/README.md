# Android app

A Capacitor shell around the same React app the website runs. There is no
second codebase: `npm run build` produces the web bundle, and `npx cap sync`
copies it into this project.

## Build a debug APK

Installable on any phone with "unknown sources" allowed. This is what to use
while testing.

```bash
cd frontend
npm run build && npx cap sync android
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk
```

`JAVA_HOME` matters: Gradle here wants JDK 21, and the system JDK is 22, which
it refuses. Android Studio bundles the right one at the path above.

## Build a release APK

Release builds must be signed, and the key is not in git. Create one once:

```bash
keytool -genkey -v -keystore ~/.config/asm-lungi-works/asm-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias asm
```

Then create `android/keystore.properties` — gitignored, never committed:

```properties
storeFile=/Users/you/.config/asm-lungi-works/asm-release.jks
storePassword=…
keyAlias=asm
keyPassword=…
```

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

Keep that .jks file safe. Phones refuse to install an update signed with a
different key, so losing it means every user has to uninstall and reinstall.

## Things that will bite

**CORS.** The app serves itself from `https://localhost`, so that is the
Origin the API sees from every phone. It is allowed unconditionally in
`backend/app/core/config.py`; if that is ever removed, every request fails and
the app reports it as the server being down.

**The API URL is baked in at build time.** `VITE_API_BASE_URL` is compiled
into the bundle, so pointing the app at a different backend means rebuilding
and reinstalling, not changing a setting.

**Google sign-in is hidden in the app.** Google refuses OAuth from embedded
WebViews, so the button cannot work here. Email and password sign-in is
unaffected. Adding native Google sign-in needs an Android app registered in
Firebase, the SHA-1 fingerprint, and `google-services.json`.
