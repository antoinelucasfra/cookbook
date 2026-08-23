local function read(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local c = f:read("*a")
  f:close()
  return c
end

return {
  ["recipe"] = function(args, kwargs)
    local slug = pandoc.utils.stringify(args[1])
    local base = "."
    if quarto.project ~= nil and quarto.project.directory ~= nil then
      base = quarto.project.directory
    end
    local html = read(base .. "/_includes/" .. slug .. ".html")
    if not html then
      error("recipe shortcode: cannot read _includes/" .. slug .. ".html (base=" .. base .. ")")
    end
    return pandoc.RawBlock("html", html)
  end
}
