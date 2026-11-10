#!/usr/bin/env bash
#
# Build et publication de l'image de production vers GitHub Container Registry.
#
# Usage :
#   ./deploy.sh [tag]              # défaut : latest
#   ./deploy.sh 1.2.0 --prod       # publie puis met la production à jour (alias : -p)
#   ./deploy.sh list|--list|-l     # versions locales et distantes
#
# Avec --prod, une fois l'image publiée, le script se connecte en SSH au serveur,
# remplace IMAGE_TAG dans le .env de l'application, puis lance
# « docker compose pull » et « docker compose up -d » (via sudo).
#   PROD_HOST=srv03                               # hôte SSH (défaut : srv03)
#   PROD_DIR=/production/apps/wmg-personality     # dossier du compose et du .env
#   PROD_COMPOSE=docker-compose.prod.yml          # fichier compose (défaut : détecté parmi
#                                                 # compose.yml, docker-compose.prod.yml, docker-compose.yml)
#
# Variables facultatives :
#   PLATFORM=linux/arm64 ./deploy.sh   # architecture du serveur (défaut : linux/amd64)
#   NO_CACHE=1 ./deploy.sh             # reconstruit tout (npm ci, image de base…)
#
# Authentification (une fois) :
#   echo "$GITHUB_TOKEN" | docker login ghcr.io -u malves --password-stdin
#   (PAT avec au minimum write:packages, ou read:packages pour un pull privé)
#
# Voir aussi : gh auth login (pour lister les tags distants via l'API GitHub).

set -euo pipefail

cd "$(dirname "$0")"

GHCR_REGISTRY="ghcr.io"
GHCR_OWNER="malves"
IMAGE_NAME="wmg-personality"
REMOTE_IMAGE="${GHCR_REGISTRY}/${GHCR_OWNER}/${IMAGE_NAME}"
LOCAL_IMAGE="${IMAGE_NAME}"
SOURCE_REPO="https://github.com/${GHCR_OWNER}/${IMAGE_NAME}"
PLATFORM="${PLATFORM:-linux/amd64}"
PROD_HOST="${PROD_HOST:-srv03}"
PROD_DIR="${PROD_DIR:-/production/apps/wmg-personality}"
PROD_COMPOSE="${PROD_COMPOSE:-}"

print_status() {
  echo -e "\033[1;32m✓ $1\033[0m"
}

print_error() {
  echo -e "\033[1;31m✗ $1\033[0m"
}

print_info() {
  echo -e "\033[1;34mℹ $1\033[0m"
}

list_local_tags() {
  print_info "Versions locales :"
  if docker images "${REMOTE_IMAGE}" --format "{{.Tag}}" 2>/dev/null | grep -q .; then
    docker images "${REMOTE_IMAGE}" --format "  • {{.Tag}}\t({{.Size}}, créé {{.CreatedSince}})"
  elif docker images "${LOCAL_IMAGE}" --format "{{.Tag}}" 2>/dev/null | grep -q .; then
    docker images "${LOCAL_IMAGE}" --format "  • {{.Tag}}\t({{.Size}}, créé {{.CreatedSince}})"
  else
    echo "  Aucune image locale trouvée"
  fi
}

list_remote_tags_gh() {
  if ! command -v gh &>/dev/null; then
    return 1
  fi
  if ! gh auth status &>/dev/null; then
    return 1
  fi

  gh api "users/${GHCR_OWNER}/packages/container/${IMAGE_NAME}/versions" --paginate \
    --jq '.[] | .metadata.container.tags[]?' 2>/dev/null | sort -u
}

list_remote_tags_manifest() {
  local test_tags=("latest" "main" "prod" "1.9" "1.8" "1.7" "1.6" "1.5" "1.4" "1.3" "1.2" "1.1" "1.0" "0.1.0")
  local tag found=()

  for tag in "${test_tags[@]}"; do
    if docker manifest inspect "${REMOTE_IMAGE}:${tag}" &>/dev/null; then
      found+=("$tag")
    fi
  done

  if [ ${#found[@]} -gt 0 ]; then
    for tag in "${found[@]}"; do
      echo "$tag"
    done
    return 0
  fi
  return 1
}

list_versions() {
  print_info "📋 Récupération des versions disponibles…"
  echo ""
  list_local_tags
  echo ""

  print_info "Versions distantes (GHCR) :"
  local remote_tags=""
  if remote_tags=$(list_remote_tags_gh); then
    :
  elif remote_tags=$(list_remote_tags_manifest); then
    print_info "Liste partielle (manifest inspect) — connectez gh pour la liste complète."
  else
    remote_tags=""
  fi

  if [ -n "$remote_tags" ]; then
    echo "  Tags disponibles à distance :"
    while IFS= read -r tag; do
      [ -n "$tag" ] && echo "    • $tag"
    done <<< "$remote_tags"
  else
    echo "  ⚠️  Aucun tag trouvé (package vide, privé sans auth, ou nom incorrect)."
    echo "  Package : https://github.com/users/${GHCR_OWNER}/packages/container/${IMAGE_NAME}/versions"
    print_info "Pour publier : ./deploy.sh latest"
    print_info "Connexion : echo \"\$GITHUB_TOKEN\" | docker login ${GHCR_REGISTRY} -u ${GHCR_OWNER} --password-stdin"
  fi

  echo ""
  print_status "Registre : ${REMOTE_IMAGE}"
  exit 0
}

# Mise à jour de la production : IMAGE_TAG dans le .env, pull, up -d.
# Les fichiers du serveur appartiennent à root et l'utilisateur n'est pas dans le
# groupe docker : tout passe par sudo (sans mot de passe, d'où sudo -n).
deploy_prod() {
  local tag="$1"

  print_info "🖥️  Mise en production sur ${PROD_HOST}:${PROD_DIR} (IMAGE_TAG=${tag})…"
  if ! ssh -o BatchMode=yes -o ConnectTimeout=15 "${PROD_HOST}" \
      bash -s -- "$(printf '%q' "${tag}")" "$(printf '%q' "${PROD_DIR}")" "$(printf '%q' "${PROD_COMPOSE}")" <<'REMOTE'
set -euo pipefail
tag="$1"
dir="$2"
compose="$3"
cd "$dir"

if [ -z "$compose" ]; then
  for f in compose.yml docker-compose.prod.yml docker-compose.yml; do
    if [ -f "$f" ]; then compose="$f"; break; fi
  done
fi

if [ ! -f .env ] || [ -z "$compose" ] || [ ! -f "$compose" ]; then
  echo "✗ .env ou fichier compose introuvable dans $dir" >&2
  exit 1
fi
echo "ℹ Fichier compose : $compose"
dc() { sudo -n docker compose -f "$compose" "$@"; }

previous="$(sudo -n grep -m1 '^IMAGE_TAG=' .env | cut -d= -f2- || true)"
echo "ℹ Version actuelle : ${previous:-(non définie, donc latest)}"

if sudo -n grep -q '^IMAGE_TAG=' .env; then
  sudo -n sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${tag}/" .env
else
  printf '\nIMAGE_TAG=%s\n' "$tag" | sudo -n tee -a .env >/dev/null
fi
echo "✓ .env : IMAGE_TAG=$(sudo -n grep -m1 '^IMAGE_TAG=' .env | cut -d= -f2-)"

echo "ℹ docker compose pull…"
dc pull
echo "ℹ docker compose up -d…"
dc up -d
dc ps --format 'table {{.Name}}\t{{.Image}}\t{{.Status}}'

if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then
  echo "ℹ Retour arrière : IMAGE_TAG=${previous} dans le .env, puis pull et up -d"
fi
REMOTE
  then
    print_error "Échec de la mise en production sur ${PROD_HOST}."
    print_info "L'image ${REMOTE_IMAGE}:${tag} est bien publiée ; à reprendre à la main :"
    echo "  ssh ${PROD_HOST}"
    echo "  cd ${PROD_DIR} && sudo sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=${tag}/' .env"
    echo "  sudo docker compose -f ${PROD_COMPOSE:-docker-compose.prod.yml} pull"
    echo "  sudo docker compose -f ${PROD_COMPOSE:-docker-compose.prod.yml} up -d"
    exit 1
  fi
  print_status "🚀 Production à jour en ${tag}"
}

TAG=""
PROD=0
for arg in "$@"; do
  case "$arg" in
    list|--list|-l) list_versions ;;
    --prod|-p) PROD=1 ;;
    -*)
      print_error "Option inconnue : $arg"
      exit 1
      ;;
    *)
      if [ -n "$TAG" ]; then
        print_error "Un seul tag attendu (reçu : $TAG et $arg)."
        exit 1
      fi
      TAG="$arg"
      ;;
  esac
done
TAG="${TAG:-latest}"

# Format d'un tag Docker (il est aussi transmis au serveur en SSH avec --prod)
if ! [[ "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
  print_error "Tag invalide : $TAG"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  print_error "Docker n'est pas installé."
  exit 1
fi

if ! docker info &>/dev/null; then
  print_error "Le démon Docker ne répond pas (permissions ou service arrêté)."
  exit 1
fi

# Commit embarqué dans l'image (suffixe -dirty si des modifications ne sont pas commitées :
# l'image est construite depuis les fichiers du dossier, pas depuis le dernier commit)
REVISION="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  REVISION="${REVISION}-dirty"
  print_info "⚠️  Des modifications ne sont pas commitées : elles seront incluses dans l'image."
fi

BUILD_ARGS=(--pull --platform "${PLATFORM}")
if [ "${NO_CACHE:-}" = "1" ]; then
  BUILD_ARGS+=(--no-cache)
fi

print_info "🚀 Publication de ${REMOTE_IMAGE}:${TAG} (${PLATFORM}, commit ${REVISION})"

print_info "🔨 Construction de l'image…"
docker build "${BUILD_ARGS[@]}" \
  --label "org.opencontainers.image.source=${SOURCE_REPO}" \
  --label "org.opencontainers.image.revision=${REVISION}" \
  --label "org.opencontainers.image.version=${TAG}" \
  -t "${LOCAL_IMAGE}:${TAG}" .

print_status "Image construite"

print_info "🏷️  Taggage pour GHCR…"
docker tag "${LOCAL_IMAGE}:${TAG}" "${REMOTE_IMAGE}:${TAG}"
print_status "Image taggée"

print_info "📤 Envoi vers ${GHCR_REGISTRY}…"
if ! docker push "${REMOTE_IMAGE}:${TAG}"; then
  print_error "Échec du push."
  echo ""
  print_info "Connexion GHCR (PAT avec scope write:packages) :"
  echo "  echo \"\$GITHUB_TOKEN\" | docker login ${GHCR_REGISTRY} -u ${GHCR_OWNER} --password-stdin"
  print_info "Créer un PAT : GitHub → Settings → Developer settings → Personal access tokens"
  exit 1
fi

print_status "Image publiée sur GHCR"

print_info "🧹 Nettoyage des tags locaux du build…"
docker rmi "${LOCAL_IMAGE}:${TAG}" "${REMOTE_IMAGE}:${TAG}" 2>/dev/null || true

print_status "🎉 Image publiée : ${REMOTE_IMAGE}:${TAG}"

if [ "$PROD" = "1" ]; then
  deploy_prod "$TAG"
  exit 0
fi

print_info "Package : https://github.com/users/${GHCR_OWNER}/packages/container/${IMAGE_NAME}/versions"
echo ""
print_info "📋 Exemples d'utilisation :"
echo "  docker pull ${REMOTE_IMAGE}:${TAG}"
echo ""
echo "  # Sur le serveur (dossier avec docker-compose.prod.yml et .env ; IMAGE_TAG=${TAG} dans le .env si ce n'est pas latest) :"
echo "  docker compose -f docker-compose.prod.yml pull"
echo "  docker compose -f docker-compose.prod.yml up -d"
