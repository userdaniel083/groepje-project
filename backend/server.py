import http.server
import socketserver

PORT = 8000

Handler = http.server.SimpleHTTPRequestHandler


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    # Start de server en het stop niet automatisch, zodat het blijft draaien totdat je het handmatig stopt
    httpd.serve_forever()