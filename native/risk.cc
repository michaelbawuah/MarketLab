#include <node_api.h>
#include <cmath>
#include <vector>
#include <algorithm>

static napi_value fail(napi_env env, const char* message) { napi_throw_type_error(env, nullptr, message); return nullptr; }
static bool array(napi_env env, napi_value value, double** data, size_t* length) {
  bool typed=false, ordinary=false; napi_typedarray_type type; napi_value buffer; size_t offset;
  if(napi_is_typedarray(env,value,&typed)!=napi_ok || !typed)return false;
  if(napi_get_typedarray_info(env,value,&type,length,reinterpret_cast<void**>(data),&buffer,&offset)!=napi_ok || type!=napi_float64_array)return false;
  // Shared input could be changed from another thread during computation.
  if(napi_is_arraybuffer(env,buffer,&ordinary)!=napi_ok || !ordinary || !*data)return false;
  return *length>=2 && *length<=2500;
}
static void number(napi_env env,napi_value object,const char* key,double value,bool defined=true){napi_value out;if(defined)napi_create_double(env,value,&out);else napi_get_null(env,&out);napi_set_named_property(env,object,key,out);}
static napi_value metrics(napi_env env,napi_callback_info info){
  size_t argc=3; napi_value args[3]; napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);
  double *values=nullptr,*benchmark=nullptr;size_t length=0,other=0;
  if(argc!=2 || !array(env,args[0],&values,&length) || !array(env,args[1],&benchmark,&other) || length!=other)return fail(env,"Use two matching, non-shared Float64Arrays of 2–2500 values.");
  for(size_t i=0;i<length;i++)if(!std::isfinite(values[i])||!std::isfinite(benchmark[i])||values[i]<=0||benchmark[i]<=0||values[i]>1e15||benchmark[i]>1e15)return fail(env,"Wealth must be finite, positive and at most 1e15.");
  try {
    const size_t n=length-1;std::vector<double> returns(n),reference(n);double mean=0,bmean=0;
    for(size_t i=0;i<n;i++){returns[i]=values[i+1]/values[i]-1;reference[i]=benchmark[i+1]/benchmark[i]-1;mean+=returns[i];bmean+=reference[i];}
    mean/=n;bmean/=n;double ss=0,bs=0,cov=0;
    for(size_t i=0;i<n;i++){double a=returns[i]-mean,b=reference[i]-bmean;ss+=a*a;bs+=b*b;cov+=a*b;}
    if(!std::isfinite(ss)||!std::isfinite(bs)||!std::isfinite(cov)||!std::isfinite(mean))return fail(env,"Wealth changes exceed the numeric range.");
    napi_value result;napi_create_object(env,&result);number(env,result,"intervals",n);
    const double sd=n>1?std::sqrt(ss/(n-1)):0;
    number(env,result,"volatilityPct",sd*100,n>1);
    number(env,result,"sharpe",ss>1e-28?mean/sd:0,n>1&&ss>1e-28);
    number(env,result,"beta",bs>1e-28?cov/bs:0,n>1&&bs>1e-28);
    number(env,result,"correlation",ss>1e-28&&bs>1e-28?std::clamp(cov/std::sqrt(ss*bs),-1.0,1.0):0,n>1&&ss>1e-28&&bs>1e-28);
    return result;
  } catch(...) {napi_throw_error(env,nullptr,"Native metric allocation failed.");return nullptr;}
}
static napi_value init(napi_env env,napi_value exports){napi_value fn;napi_create_function(env,"observedMetrics",NAPI_AUTO_LENGTH,metrics,nullptr,&fn);napi_set_named_property(env,exports,"observedMetrics",fn);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
