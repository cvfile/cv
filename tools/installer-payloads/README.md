# File-association payloads for `.cv`

Drop-in templates for registering `.cv` as a first-class file type on macOS,
Windows, and Linux. Used by the Tauri desktop viewer installer and by anyone
shipping a third-party `.cv` viewer who wants OS-level association.

## macOS

`macos/Info.plist.snippet` declares two things to splice into a bundle's
`Info.plist`:

- `CFBundleDocumentTypes` — what your app can open
- `UTExportedTypeDeclarations` — defines the UTI `org.cvfile.cv` and
  declares it conforms to `com.adobe.pdf` so `.cv` files inherit PDF
  iconography and Quick Look fallbacks until our own viewer is installed.

After install, `lsregister -dump | grep cvfile` should show the UTI bound
to your app bundle.

## Windows

`windows/cvfile.reg.template` is a `.reg` template the installer applies on
first run. Sets:

- `HKEY_CLASSES_ROOT\.cv → CVFile.Document`
- `HKEY_CLASSES_ROOT\CVFile.Document\shell\open\command → "<app> %1"`
- `HKEY_CURRENT_USER\Software\Classes\.cv\OpenWithProgids` so users can
  switch defaults from the Settings UI.

Replace `__APP_PATH__` with the real install location.

## Linux

`linux/cvfile.desktop` is the standard XDG desktop entry. Place under
`/usr/share/applications/` (system-wide) or `~/.local/share/applications/`
(per-user), then run `update-desktop-database`.

`linux/application-vnd.cv+pdf.xml` is the shared-mime-info file that maps
`*.cv` to `application/vnd.cv+pdf` and declares the PDF magic bytes for
content-sniffing fallbacks. Place under `/usr/share/mime/packages/` and run
`update-mime-database /usr/share/mime`.

After both files are installed, `xdg-mime default cvfile.desktop application/vnd.cv+pdf`
makes your app the default opener.
