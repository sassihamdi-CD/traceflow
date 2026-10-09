# TraceFlow pilot console (Next.js 14). Built + served by docker compose —
# no local Node needed. NEXT_PUBLIC_* values are baked in at BUILD time,
# so after changing keys re-run with `docker compose up --build`.
FROM node:20-alpine
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /srv/web

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY utils ./utils
COPY messages ./messages
COPY middleware.ts next.config.mjs next-env.d.ts postcss.config.js tailwind.config.js tsconfig.json ./

ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG NEXT_PUBLIC_API_URL="http://localhost:8000"
ARG NEXT_PUBLIC_PILOT_INVITE_CODE=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_PILOT_INVITE_CODE=$NEXT_PUBLIC_PILOT_INVITE_CODE

# next/font fetches Google Fonts at build time and fails the whole build on
# a transient fetch error. Retry so a flaky font CDN never blocks a deploy.
RUN for i in 1 2 3 4 5; do npm run build && break || { echo "build attempt $i failed, retrying…"; sleep 15; }; done

# Verify build output exists
RUN test -d .next && ls -la .next

EXPOSE 3000
# BusyBox wget (preinstalled on alpine) is the healthcheck client.
HEALTHCHECK --interval=15s --timeout=5s --retries=10 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p 3000"]
