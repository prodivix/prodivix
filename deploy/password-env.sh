#!/usr/bin/env bash

# Compose expands double-quoted dotenv values. Escape literal dollar signs along
# with quotes and backslashes so a prompted password reaches both services intact.
encode_postgres_password() {
  local value="$1"
  if [[ -z "$value" || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "Postgres password must be nonempty and contain no line breaks." >&2
    return 1
  fi
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\$\$}"
  printf '"%s"' "$value"
}

# Decode the literal format this script writes without executing credential text.
# Unquoted values remain supported for existing generated alphanumeric passwords.
decode_postgres_password() {
  local value="$1"
  local decoded=""
  local character next index
  if [[ "$value" != \"* ]]; then
    printf '%s' "$value"
    return
  fi
  if [[ ${#value} -lt 2 || "$value" != *\" ]]; then
    echo "POSTGRES_PASSWORD has an unterminated quoted value." >&2
    return 1
  fi
  value="${value:1:${#value}-2}"
  for ((index = 0; index < ${#value}; index++)); do
    character="${value:index:1}"
    case "$character" in
      '\')
        index=$((index + 1))
        next="${value:index:1}"
        case "$next" in
          '\' | '"') decoded+="$next" ;;
          *)
            echo "POSTGRES_PASSWORD has an unsupported dotenv escape." >&2
            return 1
            ;;
        esac
        ;;
      '$')
        index=$((index + 1))
        if [[ "${value:index:1}" != '$' ]]; then
          echo "POSTGRES_PASSWORD must escape literal dollar signs as \$\$ inside quotes." >&2
          return 1
        fi
        decoded+='$'
        ;;
      '"')
        echo "POSTGRES_PASSWORD has an unescaped quote." >&2
        return 1
        ;;
      *) decoded+="$character" ;;
    esac
  done
  printf '%s' "$decoded"
}
