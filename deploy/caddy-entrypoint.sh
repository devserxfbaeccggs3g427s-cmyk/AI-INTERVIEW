#!/bin/sh
# Only a single bcrypt credential line is valid; never pass untrusted Caddyfile
# directives from the mounted secret to the public-facing proxy.
set -eu
file=/run/secrets/basic_auth_snippet
if [ ! -r "$file" ] || ! IFS= read -r credential < "$file" ||
    ! printf '%s\n' "$credential" | cmp -s - "$file" ||
    ! printf '%s\n' "$credential" | grep -Eq '^owner \$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'; then
    printf '%s\n' 'Invalid Basic Auth secret; refusing to start Caddy' >&2
    exit 1
fi
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
