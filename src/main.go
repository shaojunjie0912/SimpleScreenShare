package main

import (
	"fmt"
	"net/http"
)

func StartHttp(port string) {
	fmt.Printf("Starting http server on port %s\n", port)
	err := http.ListenAndServe(port, nil)
	if err != nil {
		fmt.Println(err)
	}
}

func StartHttps(port, cert_file, key_file string) {
	fmt.Printf("Starting https server on port %s\n", port)
	err := http.ListenAndServeTLS(port, cert_file, key_file, nil)
	if err != nil {
		fmt.Println(err)
	}
}

func main() {
	static_url := "/static/" // 定义 url 前缀

	fs := http.FileServer(http.Dir("./static")) // 定义文件服务器

	http.Handle(static_url, http.StripPrefix(static_url, fs)) // 绑定 url 和文件服务器

	go StartHttp(":8080") // 协程?

	StartHttps(":8081", "./conf/server.crt", "./conf/server.key")

}
