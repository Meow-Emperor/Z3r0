from urllib.parse import quote

from model.egress_proxy.proxies import EgressProxy


def egress_proxy_upstream(proxy: EgressProxy) -> str:
    auth = ""
    if proxy.proxy_account:
        account = quote(proxy.proxy_account, safe="")
        password = quote(proxy.proxy_password, safe="")
        auth = f"{account}:{password}@"
    return f"{auth}{proxy.proxy_host}:{proxy.proxy_port}"
