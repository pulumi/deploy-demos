FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:16 as builder
WORKDIR /usr/app
COPY package.json index.ts  ./
RUN npm install
RUN npm run build


FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:16

ENV AWS_REGION="${AWS_REGION}"
ENV AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
ENV AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
ENV AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN}"
ENV GITHUB_ACCESS_TOKEN="${GITHUB_ACCESS_TOKEN}"

RUN yum install -y tar gzip
RUN curl -fsSL https://get.pulumi.com | sh -s -- --version 3.45.0 && mv ~/.pulumi/bin/* /bin/
RUN pulumi version --non-interactive

WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=builder /usr/app/dist/* ./
CMD ["index.handler"]
