FROM node:20-slim

RUN npm install -g apibase-mcp-client

ENTRYPOINT ["apibase-mcp"]
