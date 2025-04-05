FROM denoland/deno:1.43.0
WORKDIR /app
COPY . .
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--reload", "--watch", "main.ts"]