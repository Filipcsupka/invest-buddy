# Reading application logs

Web request logs and batch job lifecycle logs are JSON lines on standard output and standard error. Read them with `kubectl -n invest logs deployment/invest-buddy-web --since=1h` or `kubectl -n invest logs job/<job-name> --tail=100`. Use the `requestId` from a response's `x-request-id` header to find its ingest log line. Job start and end lines share a `runId`.

Logs stay in the cluster's container logs. There is no application log archive or fixed retention period: kubelet rotation can remove older lines, and deleting a pod removes access through `kubectl logs`. Inspect a failed job before its pod is cleaned up.
