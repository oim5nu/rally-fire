export function resolveRedirectArgument(arguments_) {
  return arguments_.find((argument) => argument !== '--');
}
