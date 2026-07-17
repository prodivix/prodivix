package remoteexecution

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"time"
)

type remoteDataHTTPTransport struct {
	client *http.Client
}

func publicAddress(address net.IP) bool {
	parsed, ok := netip.AddrFromSlice(address)
	if !ok {
		return false
	}
	parsed = parsed.Unmap()
	if !parsed.IsGlobalUnicast() || parsed.IsPrivate() || parsed.IsLoopback() || parsed.IsLinkLocalUnicast() || parsed.IsMulticast() || parsed.IsUnspecified() {
		return false
	}
	for _, prefix := range []netip.Prefix{
		netip.MustParsePrefix("100.64.0.0/10"),
		netip.MustParsePrefix("192.0.0.0/24"),
		netip.MustParsePrefix("192.0.2.0/24"),
		netip.MustParsePrefix("198.18.0.0/15"),
		netip.MustParsePrefix("198.51.100.0/24"),
		netip.MustParsePrefix("203.0.113.0/24"),
		netip.MustParsePrefix("2001:db8::/32"),
	} {
		if prefix.Contains(parsed) {
			return false
		}
	}
	return true
}

func newRemoteDataHTTPTransport() DataGatewayTransport {
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network string, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, ErrDataGatewayDenied
			}
			addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil || len(addresses) == 0 {
				return nil, ErrDataGatewayUpstream
			}
			for _, resolved := range addresses {
				if !publicAddress(resolved.IP) {
					return nil, ErrDataGatewayDenied
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(addresses[0].IP.String(), port))
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
	}
	return &remoteDataHTTPTransport{client: &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return errors.New("remote Data gateway redirects are disabled")
		},
	}}
}

func (transport *remoteDataHTTPTransport) Execute(ctx context.Context, input DataGatewayTransportRequest) (*DataGatewayTransportResponse, error) {
	endpoint, err := url.Parse(input.URL)
	if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" {
		return nil, ErrDataGatewayDenied
	}
	request, err := http.NewRequestWithContext(ctx, input.Method, input.URL, bytes.NewReader(input.Body))
	if err != nil {
		return nil, ErrDataGatewayInvalidRequest
	}
	for name, value := range input.Headers {
		request.Header.Set(name, value)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "Prodivix-Remote-Data-Gateway/1")
	response, err := transport.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumDataGatewayResponseBytes+1))
	if err != nil || int64(len(body)) > maximumDataGatewayResponseBytes {
		return nil, ErrDataGatewayUpstream
	}
	if response.StatusCode < 100 || response.StatusCode > 599 {
		return nil, ErrDataGatewayUpstream
	}
	return &DataGatewayTransportResponse{Status: response.StatusCode, Body: body}, nil
}
