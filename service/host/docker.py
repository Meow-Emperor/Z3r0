from __future__ import annotations

from datetime import datetime, timezone

import docker
from docker.api.client import APIClient
from docker.utils import parse_repository_tag

from model.host.hosts import ManagedHost
from schema.host.hosts import ManagedHostImageSchema, PullManagedHostImageResultSchema


def docker_client_for_host(host: ManagedHost, *, timeout: int = 60) -> docker.DockerClient:
    return DirectDockerClient(
        base_url=f"tcp://{host.ip_address}:{host.docker_management_port}",
        timeout=timeout,
    )


class DirectDockerClient(docker.DockerClient):
    def __init__(self, *args, **kwargs):
        self.api = DirectDockerAPIClient(*args, **kwargs)


class DirectDockerAPIClient(APIClient):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trust_env = False

    def _retrieve_server_version(self):
        self.trust_env = False
        return super()._retrieve_server_version()


def inspect_image_on_host_sync(host: ManagedHost, image_name: str) -> dict:
    client = docker_client_for_host(host)
    try:
        return client.api.inspect_image(image_name)
    finally:
        client.close()


def list_host_images_sync(host: ManagedHost) -> list[ManagedHostImageSchema]:
    client = docker_client_for_host(host)
    try:
        images = client.images.list()
        return [_image_schema(image.attrs) for image in images]
    finally:
        client.close()


def pull_host_images_sync(host: ManagedHost, image_names: list[str]) -> list[PullManagedHostImageResultSchema]:
    client = docker_client_for_host(host, timeout=300)
    try:
        results: list[PullManagedHostImageResultSchema] = []
        for image_name in image_names:
            try:
                repository, tag = parse_repository_tag(image_name)
                client.api.pull(repository, tag=tag)
                results.append(PullManagedHostImageResultSchema(
                    image_name=image_name,
                    success=True,
                    message="pulled",
                ))
            except Exception as exc:
                results.append(PullManagedHostImageResultSchema(
                    image_name=image_name,
                    success=False,
                    message=str(exc) or "pull failed",
                ))
        return results
    finally:
        client.close()


def remove_host_image_sync(host: ManagedHost, image_id: str, force: bool = False) -> None:
    client = docker_client_for_host(host)
    try:
        client.images.remove(image_id, force=force)
    finally:
        client.close()


def _image_schema(attrs: dict) -> ManagedHostImageSchema:
    image_id = str(attrs.get("Id") or "")
    repo_tags = attrs.get("RepoTags") if isinstance(attrs.get("RepoTags"), list) else []
    image_name = next((str(tag) for tag in repo_tags if tag and tag != "<none>:<none>"), "")
    created_at = _parse_docker_datetime(attrs.get("Created"))
    return ManagedHostImageSchema(
        image_name=image_name or image_id.removeprefix("sha256:")[:12],
        image_id=image_id,
        image_hash=image_id.removeprefix("sha256:"),
        image_size=max(int(attrs.get("Size") or 0), 0),
        created_at=created_at,
    )


def _parse_docker_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = value.rstrip("Z")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed
