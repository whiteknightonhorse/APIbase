FROM node:24-slim

RUN npm install -g apibase-mcp-client

ENTRYPOINT ["apibase-mcp"]
