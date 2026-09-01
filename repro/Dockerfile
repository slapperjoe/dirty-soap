# Controlled-reproduction runtime for APInox update-failure (t_b6c2aed3).
# Runs the real apinox example binaries + a fake-GitHub HTTPS server.
FROM python:3.12-slim

COPY repro_proxy_server /opt/bin/repro_proxy_server
COPY repro_update_client /opt/bin/repro_update_client
COPY fake_github.py /opt/bin/fake_github.py
COPY ssl /ssl
COPY www /www

RUN chmod +x /opt/bin/repro_proxy_server /opt/bin/repro_update_client /opt/bin/fake_github.py \
    && ln -s /opt/bin/fake_github.py /usr/local/bin/fake_github.py
# fake github needs python + ssl (in slim)
ENV PYTHONUNBUFFERED=1
CMD ["/opt/bin/fake_github.py"]
