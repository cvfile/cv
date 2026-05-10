#!/bin/sh
# Refresh the system MIME and desktop databases so the .cv file
# association we just installed becomes active immediately. Both
# tools are missing on minimal containers and headless servers, so
# tolerate failure rather than blocking the install.
update-mime-database /usr/share/mime || true
update-desktop-database /usr/share/applications || true
