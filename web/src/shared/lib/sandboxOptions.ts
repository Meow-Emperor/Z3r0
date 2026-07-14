import {
  SANDBOX_CONTAINER_EGRESS_MODE,
  SANDBOX_CONTAINER_EGRESS_MODE_VALUES,
} from "../api/generated/constants";
import type {
  EgressProxy,
  SandboxContainerEgressMode,
  SandboxImage,
} from "../api/types";
import { SANDBOX_CONTAINER_EGRESS_MODE_LABEL } from "./labels";

type SandboxHostOptionSource = {
  id: number;
  ip_address: string;
  docker_management_port: number;
};

export function sandboxHostOption(host: SandboxHostOptionSource) {
  return {
    label: `${host.ip_address}:${host.docker_management_port}`,
    value: host.id,
  };
}

export function sandboxImageOption(image: SandboxImage) {
  return {
    label: `${image.image_name} - control ${image.control_proxy_port}`,
    value: image.id,
  };
}

export function egressProxyOption(proxy: EgressProxy) {
  return {
    label: `${proxy.proxy_type}://${proxy.proxy_host}:${proxy.proxy_port}`,
    value: proxy.id,
  };
}

export function sandboxEgressModeOptions({
  includeProxy,
  supportsTor,
}: {
  includeProxy: boolean;
  supportsTor: boolean;
}) {
  return SANDBOX_CONTAINER_EGRESS_MODE_VALUES
    .filter((mode) => includeProxy || mode !== SANDBOX_CONTAINER_EGRESS_MODE.PROXY)
    .map((mode: SandboxContainerEgressMode) => ({
      label: SANDBOX_CONTAINER_EGRESS_MODE_LABEL[mode],
      value: mode,
      disabled: mode === SANDBOX_CONTAINER_EGRESS_MODE.TOR && !supportsTor,
    }));
}
