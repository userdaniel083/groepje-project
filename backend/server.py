import http.server
import socketserver
class myHandler(http.server.SimpleHTTPRequestHandler):
  def do_GET(self):
    print("Request received, sending redirect...")
    self.send_response(301)
    self.send_header('Location', 'localhost:3000')
    self.end_headers()
PORT = 8000
handler = socketserver.TCPServer(("", PORT), myHandler)
print("serving at port 80")
handler.serve_forever()