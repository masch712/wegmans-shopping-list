tsc.cmd;
rm .\build\Release\build.zip;
7z a build\Release\build.zip .\node_modules .\build\Debug\* .\config;